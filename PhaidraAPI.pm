package PhaidraAPI;

use strict;
use warnings;
use Mojo::Base 'Mojolicious';
use Mojo::Log;
use Mojolicious::Plugin::I18N;
use Mojolicious::Plugin::Session;
use Mojo::Loader qw(load_class);
use lib "lib/phaidra_directory";
use lib "lib/phaidra_binding";
use Mango 0.24;
use Sereal::Encoder qw(encode_sereal);
use Sereal::Decoder qw(decode_sereal);
use Crypt::CBC              ();
use Crypt::Rijndael         ();
use Crypt::URandom          (qw/urandom/);
use Digest::SHA             (qw/hmac_sha256/);
use Math::Random::ISAAC::XS ();

BEGIN
{
  # that's what we want:
  # use MIME::Base64 3.12 (qw/encode_base64url decode_base64url/);

  # but you don't always get what you want, so:
  use MIME::Base64 (qw/encode_base64 decode_base64/);

  sub encode_base64url {
    my $e = encode_base64(shift, "");
    $e =~ s/=+\z//;
    $e =~ tr[+/][-_];
    return $e;
  }

  sub decode_base64url {
    my $s = shift;
    $s =~ tr[-_][+/];
    $s .= '=' while length($s) % 4;
    return decode_base64($s);
  }
}

use PhaidraAPI::Model::Session::Transport::Header;
use PhaidraAPI::Model::Session::Store::Mongo;

# This method will run once at server start
sub startup {
    my $self = shift;

    my $config = $self->plugin( 'JSONConfig' => { file => 'PhaidraAPI.json' } );
	$self->config($config);  
	$self->mode($config->{mode});     
    $self->secrets([$config->{secret}]);
    
    # init log	
  	$self->log(Mojo::Log->new(path => $config->{log_path}, level => $config->{log_level}));

	my $directory_impl = $config->{directory_class};
	my $e = load_class $directory_impl;
    my $directory = $directory_impl->new($self, $config);
 
    $self->helper( directory => sub { return $directory; } );
        
  	# init I18N
  	$self->plugin(charset => {charset => 'utf8'});
  	$self->plugin(I18N => {namespace => 'PhaidraAPI::I18N', support_url_langs => [qw(en de it sr)]});
  	
  	# init cache
  	$self->plugin(CHI => {
	    default => {
	      	driver     => 'Memory',
	    	#driver     => 'File', # FastMmap seems to have problems saving the metadata structure (it won't save anything)
	    	#root_dir   => '/tmp/phaidra-api-cache',
	    	#cache_size => '20m',
	      	global => 1,
	      	#serializer => 'Storable',
    	},
  	});
  	
  	# init databases
  	my %databases;
  	$databases{'db_metadata'} = { 
				dsn      => $config->{phaidra_db}->{dsn},
                username => $config->{phaidra_db}->{username},
                password => $config->{phaidra_db}->{password},
                options  => { mysql_auto_reconnect => 1}
    };

	if($config->{phaidra}->{triplestore} eq 'localMysqlMPTTriplestore'){
		$databases{'db_triplestore'} = { 
				dsn      => $config->{localMysqlMPTTriplestore}->{dsn},
                username => $config->{localMysqlMPTTriplestore}->{username},
                password => $config->{localMysqlMPTTriplestore}->{password},
                options  => { mysql_auto_reconnect => 1}
    	};
	}           

    $self->plugin('database', { databases => \%databases } );
	
	$self->helper(mango => sub { state $mango = Mango->new('mongodb://'.$config->{mongodb}->{username}.':'.$config->{mongodb}->{password}.'@'.$config->{mongodb}->{host}.'/'.$config->{mongodb}->{database}) });
	
    # we might possibly save a lot of data to session 
    # so we are not going to use cookies, but a database instead
    $self->plugin(
        session => {
            stash_key     => 'mojox-session',
	    	store  => PhaidraAPI::Model::Session::Store::Mongo->new( 
	    		mango => $self->mango, 
	    		'log' => $self->log 
	    	),              
	    	transport => PhaidraAPI::Model::Session::Transport::Header->new(
	    		name => $config->{authentication}->{token_header},
	    		'log' => $self->log 
	    		),
            expires_delta => $config->{session_expiration}, 
	    	ip_match      => 1
        }
    );
    
    $self->hook('before_dispatch' => sub {
		my $self = shift;		  
		
		my $session = $self->stash('mojox-session');
		$session->load;
		if($session->sid){
			$session->extend_expires;
			$session->flush;			
		}      	
	});
	
	$self->hook('after_dispatch' => sub {
		my $self = shift;		  
		my $json = $self->res->json;
		if($json){
			if($json->{alerts}){
				if(scalar(@{$json->{alerts}}) > 0){
					$self->app->log->debug("Alerts:\n".$self->dumper($json->{alerts}));
				}	
			}	
		}
		
		# CORS
		if($self->req->headers->header('Origin')){
			$self->res->headers->add('Access-Control-Allow-Origin' => $self->req->headers->header('Origin'));	
		}else{
			$self->res->headers->add('Access-Control-Allow-Origin' => $config->{authentication}->{'Access-Control-Allow-Origin'});
		}
		$self->res->headers->add('Access-Control-Allow-Credentials' => 'true');
		$self->res->headers->add('Access-Control-Allow-Methods' => 'GET, POST, PUT, DELETE, OPTIONS');
		$self->res->headers->add('Access-Control-Allow-Headers' => 'Content-Type, '.$config->{authentication}->{token_header});				     	
	});
     
    $self->helper(save_cred => sub {
    	my $self = shift;
		my $u = shift;
		my $p = shift;
		
		my $ciphertext;
		
		my $session = $self->stash('mojox-session');
		$session->load;
		unless($session->sid){		
			$session->create;		
		}	
		my $ba = encode_sereal({ username => $u, password => $p });  	
	    my $salt = Math::Random::ISAAC::XS->new( map { unpack( "N", urandom(4) ) } 1 .. 256 )->irand();
	    my $key = hmac_sha256( $salt, $self->app->config->{enc_key} );
	    my $cbc = Crypt::CBC->new( -key => $key, -cipher => 'Rijndael' );
	    
	    eval {
	        $ciphertext = encode_base64url( $cbc->encrypt( $ba ) );      
	    };
	    $self->app->log->error("Encoding error: $@") if $@;
		$session->data(cred => $ciphertext, salt => $salt);
    });
    
    $self->helper(load_cred => sub {
    	my $self = shift;
    	
    	my $session = $self->stash('mojox-session');
		$session->load;
		unless($session->sid){
			return undef;
		}
		
		my $salt = $session->data('salt');
		my $ciphertext = $session->data('cred');		
	    my $key = hmac_sha256( $salt, $self->app->config->{enc_key} );	
	    my $cbc = Crypt::CBC->new( -key => $key, -cipher => 'Rijndael' );
	    my $data;
	    eval {  
	    	$data = decode_sereal($cbc->decrypt( decode_base64url($ciphertext) ))	    	
	   	};
	    $self->app->log->error("Decoding error: $@") if $@;
	
	    return $data;
    });	 
     
    my $r = $self->routes;
    $r->namespaces(['PhaidraAPI::Controller']);
    
    # PUT vs POST in this API: PUT should be idempotent
    		
	$r->route('uwmetadata/tree')                    ->via('get')    ->to('uwmetadata#tree');
	$r->route('uwmetadata/languages')               ->via('get')    ->to('uwmetadata#languages');
    $r->route('uwmetadata/json2xml')                ->via('post')   ->to('uwmetadata#json2xml');
    $r->route('uwmetadata/xml2json')                ->via('post')   ->to('uwmetadata#xml2json');
    $r->route('uwmetadata/validate')                ->via('post')   ->to('uwmetadata#validate');
    $r->route('uwmetadata/json2xml_validate')       ->via('post')   ->to('uwmetadata#json2xml_validate');
    
    $r->route('mods/tree')                          ->via('get')    ->to('mods#tree');
	
	$r->route('help/tooltip')                       ->via('get')    ->to('help#tooltip');		
	
	$r->route('directory/get_org_units')            ->via('get')    ->to('directory#get_org_units');
	$r->route('directory/get_study')                ->via('get')    ->to('directory#get_study');
	$r->route('directory/get_study_name')           ->via('get')    ->to('directory#get_study_name');
	
	$r->route('search/owner/:username')             ->via('get')    ->to('search#owner');
	$r->route('search/collections/owner/:username') ->via('get')    ->to('search#collections_owner');
	$r->route('search/triples')                     ->via('get')    ->to('search#triples');
	$r->route('search')                             ->via('get')    ->to('search#search');
	
	$r->route('terms/label')                   		->via('get')    ->to('terms#label');
	$r->route('terms/children')                		->via('get')    ->to('terms#children');
	$r->route('terms/search')                       ->via('get')    ->to('terms#search');
	$r->route('terms/taxonpath')                    ->via('get')    ->to('terms#taxonpath');
	$r->route('terms/parent')                       ->via('get')    ->to('terms#parent');

	# CORS
	$r->any('*')                                    ->via('options')->to('authentication#cors_preflight');
	
	$r->route('signin')                             ->via('get')    ->to('authentication#signin');
    $r->route('signout')                            ->via('get')    ->to('authentication#signout');   
    $r->route('keepalive')                          ->via('get')    ->to('authentication#keepalive');   

	$r->route('collection/:pid/members')            ->via('get')    ->to('collection#get_collection_members');
	# does not show inactive objects, not specific to collection (but does ordering)
    $r->route('object/:pid/related')                                  ->via('get')      ->to('search#related');
    $r->route('object/:pid/uwmetadata')                               ->via('get')      ->to('uwmetadata#get');

	my $apiauth = $r->under('/')->to('authentication#extract_credentials');

	$apiauth->route('my/objects')                                           ->via('get')      ->to('search#my_objects');
	
	if($self->app->config->{allow_userdata_queries}){
    	$apiauth->route('directory/user/:username/data')                    ->via('get')      ->to('directory#get_user_data');
   		$apiauth->route('directory/user/:username/name')                    ->via('get')      ->to('directory#get_user_name');
   		$apiauth->route('directory/user/:username/email')                   ->via('get')      ->to('directory#get_user_email');
    }
	    
    unless($self->app->config->{readonly}){
	   	$apiauth->route('object/:pid/modify')                               ->via('put')      ->to('object#modify');
		$apiauth->route('object/:pid')                                      ->via('delete')   ->to('object#delete');
		$apiauth->route('object/:pid/uwmetadata')                           ->via('post')     ->to('uwmetadata#post');
		$apiauth->route('object/create')                                    ->via('post')     ->to('object#create_empty');
		$apiauth->route('object/create/:cmodel')                            ->via('post')     ->to('object#create');
		$apiauth->route('object/:pid/relationship')                         ->via('put')      ->to('object#add_relationship');		
		$apiauth->route('object/:pid/relationship')                         ->via('delete')   ->to('object#purge_relationship');
		$apiauth->route('object/:pid/datastream/:dsid')                     ->via('put')      ->to('object#add_datastream');
		$apiauth->route('object/:pid/data')                                 ->via('put')      ->to('object#add_octets');
		
		$apiauth->route('picture/create')                                   ->via('post')     ->to('object#create_simple', cmodel => 'cmodel:Picture');
		$apiauth->route('document/create')                                  ->via('post')     ->to('object#create_simple', cmodel => 'cmodel:PDFDocument');
		$apiauth->route('video/create')                                     ->via('post')     ->to('object#create_simple', cmodel => 'cmodel:Video');
		$apiauth->route('audio/create')                                     ->via('post')     ->to('object#create_simple', cmodel => 'cmodel:Audio');
		
		$apiauth->route('collection/create')                                ->via('post')     ->to('collection#create');
		$apiauth->route('collection/:pid/members')                          ->via('delete')   ->to('collection#remove_collection_members');
        $apiauth->route('collection/:pid/members')                          ->via('post')     ->to('collection#add_collection_members');
        $apiauth->route('collection/:pid/members')                          ->via('put')      ->to('collection#set_collection_members');
        $apiauth->route('collection/:pid/members/order')                    ->via('post')     ->to('collection#order_collection_members');
        $apiauth->route('collection/:pid/members/:itempid/order/:position') ->via('post')     ->to('collection#order_collection_member');        
    }
    
	return $self;
}

1;
