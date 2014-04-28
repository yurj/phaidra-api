package PhaidraAPI::Controller::Uwmetadata;

use strict;
use warnings;
use v5.10;
use Mojo::UserAgent;
use Mojo::Util 'squish';
use base 'Mojolicious::Controller';
use PhaidraAPI::Model::Uwmetadata;
use Time::HiRes qw/tv_interval gettimeofday/;

sub get {
    my $self = shift;  	
	
	my $t0 = [gettimeofday];

	my $v = $self->param('mfv');
	my $pid = $self->stash('pid');
	
	# default
	unless(defined($v)){
		$v = '1';	
	}
	
	unless($v eq '1'){		 	
		$self->render(json => { alerts => [{ type => 'danger', msg => 'Unsupported metadata format version specified' }]} , status => 400) ;		
		return;
	}	
			
	unless(defined($pid)){		
		$self->render(json => { alerts => [{ type => 'danger', msg => 'Undefined pid' }]} , status => 400) ;		
		return;
	}	
		
	# get metadata datastructure
	my $metadata_model = PhaidraAPI::Model::Uwmetadata->new;	
	my $res= $metadata_model->get_object_metadata($self, $v, $pid, $self->stash->{basic_auth_credentials}->{username}, $self->stash->{basic_auth_credentials}->{password});
	if($res->{status} ne 200){
		$self->render(json => { alerts => $res->{alerts} }, $res->{status});
	}
	
	my $languages = $metadata_model->get_languages($self);
	
	my $t1 = tv_interval($t0);	
	#$self->stash( msg => "backend load took $t1 s");
	
    $self->render(json => { metadata => $res->{metadata}, languages => $languages}); #, alerts => [{ type => 'success', msg => $self->stash->{msg}}]});
}

sub post {
	my $self = shift;  	
	
	my $t0 = [gettimeofday];

	my $v = $self->param('mfv');
	my $pid = $self->stash('pid');

	my $payload = $self->req->json;
	my $uwmetadata = $payload->{uwmetadata};		
	
	# default
	unless(defined($v)){
		$v = '1';	
	}
	
	unless($v eq '1'){		 	
		$self->render(json => { alerts => [{ type => 'danger', msg => 'Unsupported metadata format version specified' }]} , status => 400) ;		
		return;
	}	
			
	unless(defined($pid)){		
		$self->render(json => { alerts => [{ type => 'danger', msg => 'Undefined pid' }]} , status => 400) ;		
		return;
	}	

	unless(defined($uwmetadata)){		 	
		$self->render(json => { alerts => [{ type => 'danger', msg => 'No data sent' }]} , status => 400) ;		
		return;
	}
	
	my $metadata_model = PhaidraAPI::Model::Uwmetadata->new;
	
	my $res = $metadata_model->save_to_object($self, $pid, $uwmetadata, $self->stash->{basic_auth_credentials}->{username}, $self->stash->{basic_auth_credentials}->{password});
	
	my $t1 = tv_interval($t0);	
	if($res->{status} eq 200){		
		unshift @{$res->{alerts}}, { type => 'success', msg => "UWMetadata for $pid saved successfuly"};
	}
	
	$self->render(json => { alerts => $res->{alerts} } , status => $res->{status});
}

sub tree {
    my $self = shift;  	
	
	my $t0 = [gettimeofday];
	
	my $v = $self->param('mfv');
	
	# default
	unless(defined($v)){
		$v = '1';	
	}
	
	unless($v eq '1'){		 	
		$self->render(json => { alerts => [{ type => 'danger', msg => 'Unsupported metadata format version specified' }]} , status => 400) ;		
		return;
	}	
	
	my $metadata_model = PhaidraAPI::Model::Uwmetadata->new;
	
	my $languages = $metadata_model->get_languages($self);
	
	my $res = $metadata_model->metadata_tree($self, $v);
	if($res->{status} ne 200){
		$self->render(json => { alerts => $res->{alerts} }, $res->{status});
	}	
	
	my $t1 = tv_interval($t0);	
	$self->stash( msg => "backend load took $t1 s");
	
    $self->render(json => { tree => $res->{metadata_tree}, languages => $languages, alerts => $res->{alerts} }, status => $res->{status});	
}

sub languages {
	my $self = shift;
	
	# get metadata datastructure
	my $metadata_model = PhaidraAPI::Model::Uwmetadata->new;	
	my $languages = $metadata_model->get_languages($self);
			
    $self->render(json => { languages => $languages});	
}

1;
